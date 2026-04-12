import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2int from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwv2auth from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as path from 'path';
import { Construct } from 'constructs';

export type GuardianPocStackProps = cdk.StackProps & {
  readonly guardianModelId: string;
  readonly coachModelId: string;
  /**
   * Cognito User Pool whose JWTs gate the /turn endpoint. Required —
   * there is no unauthenticated path into the Guardian.
   */
  readonly userPool: cognito.IUserPool;
  /**
   * Audiences allowed by the JWT authorizer — typically the Web + MCP
   * client IDs from AuthStack. Any token not issued to one of these
   * clients is rejected even if it comes from the same user pool.
   */
  readonly allowedClientIds: readonly string[];
  /**
   * Extra origins allowed for CORS. Localhost dev origins are always
   * included; pass the CloudFront domain once the frontend stack lands.
   */
  readonly extraCorsOrigins?: readonly string[];
};

export class GuardianPocStack extends cdk.Stack {
  public readonly api: apigwv2.HttpApi;
  public readonly orchestratorFn: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: GuardianPocStackProps) {
    super(scope, id, props);

    // Versioned S3 bucket for Guardian constitution YAMLs — versioning gives
    // us an audit trail of every 4-eyes-reviewed change.
    const constitutionBucket = new s3.Bucket(this, 'ConstitutionBucket', {
      bucketName: `guardian-demo-guardian-constitution-${this.account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new s3deploy.BucketDeployment(this, 'ConstitutionDeployment', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../../guardian'))],
      destinationBucket: constitutionBucket,
      retainOnDelete: false,
    });

    const orchestratorLogGroup = new logs.LogGroup(this, 'OrchestratorLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.orchestratorFn = new nodejs.NodejsFunction(this, 'OrchestratorFn', {
      entry: path.join(__dirname, '../../../services/guardian-poc/src/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      logGroup: orchestratorLogGroup,
      environment: {
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
        GUARDIAN_MODEL_ID: props.guardianModelId,
        COACH_MODEL_ID: props.coachModelId,
        CONSTITUTION_BUCKET: constitutionBucket.bucketName,
        CONSTITUTION_INPUT_KEY: 'constitution.input.yaml',
        CONSTITUTION_OUTPUT_KEY: 'constitution.output.yaml',
        LOG_LEVEL: 'INFO',
      },
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: 'node24',
        externalModules: ['@aws-sdk/*'],
        // ESM bundles with CJS dependencies need a runtime `require` shim.
        // `yaml`'s internals call `require('process')`, which esbuild
        // otherwise transforms into __require() and then throws at init.
        // createRequire gives us a real require() bound to the bundle URL.
        banner:
          "import { createRequire as topLevelCreateRequire } from 'node:module'; const require = topLevelCreateRequire(import.meta.url);",
      },
    });

    constitutionBucket.grantRead(this.orchestratorFn);

    // EU-scoped Bedrock invoke permissions for Guardian + Coach.
    //
    // The EU inference profiles (eu.anthropic.*) route to whichever EU
    // region has capacity — typically eu-central-1, eu-west-1, or
    // eu-north-1. The invoke permission must cover the underlying
    // foundation-model ARNs in ALL EU regions, not just this stack's
    // region. Profiles are still regional (home region here).
    //
    // Bedrock's model ID naming: the foundation-model ARN drops the
    // `eu.` prefix that the inference profile uses (e.g.
    // `eu.anthropic.claude-haiku-4-5-...` → foundation model
    // `anthropic.claude-haiku-4-5-...`).
    const stripProfilePrefix = (id: string): string => id.replace(/^eu\./, '');
    const guardianModelBase = stripProfilePrefix(props.guardianModelId);
    const coachModelBase = stripProfilePrefix(props.coachModelId);

    // Foundation-model region is wildcarded because the EU inference
    // profile routes to whichever EU region has capacity (we've seen
    // eu-central-1, eu-north-1, eu-south-1 in traces). Data residency
    // is still enforced at the inference-profile level below — the
    // profile itself is regional and the `eu.` prefix restricts it
    // to EU-only physical models.
    this.orchestratorFn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'InvokeBedrockFoundationModels',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:*::foundation-model/${guardianModelBase}`,
          `arn:aws:bedrock:*::foundation-model/${coachModelBase}`,
        ],
      })
    );
    this.orchestratorFn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'InvokeBedrockInferenceProfilesEU',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${props.guardianModelId}`,
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${props.coachModelId}`,
        ],
      })
    );

    // Cognito JWT authorizer — every /turn call must carry a valid access
    // token issued to one of the allowed client IDs. No public path.
    const jwtAuthorizer = new apigwv2auth.HttpJwtAuthorizer(
      'CognitoJwtAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`,
      {
        jwtAudience: [...props.allowedClientIds],
        identitySource: ['$request.header.Authorization'],
      }
    );

    const corsOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      ...(props.extraCorsOrigins ?? []),
    ];

    this.api = new apigwv2.HttpApi(this, 'GuardianPocApi', {
      apiName: 'guardian-demo-guardian-poc',
      description: 'Guardian PoC orchestrator — Cognito JWT required on every route',
      corsPreflight: {
        allowOrigins: corsOrigins,
        allowMethods: [apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['authorization', 'content-type'],
        allowCredentials: false,
        maxAge: cdk.Duration.minutes(10),
      },
    });

    this.api.addRoutes({
      path: '/turn',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2int.HttpLambdaIntegration('OrchestratorInt', this.orchestratorFn),
      authorizer: jwtAuthorizer,
    });

    // --- Bedrock native Guardrail (comparison baseline) ---
    //
    // Mirrors the same finance-coach rules from constitution.input.yaml
    // and constitution.output.yaml, but expressed as a Bedrock Guardrail
    // resource. This lets deployers compare the Guardian Pattern (custom
    // constitutional classifier) with AWS's built-in guardrails — same
    // coach model, same rules, different enforcement mechanism.

    const guardrail = new cdk.aws_bedrock.CfnGuardrail(this, 'FinanceCoachGuardrail', {
      name: 'guardian-demo-finance-coach',
      description:
        'Finance Coach guardrail — blocks investment advice, tax advice, insurance recommendations, and flags crisis situations. Mirrors the Guardian Pattern constitution for side-by-side comparison.',
      blockedInputMessaging:
        'Darüber kann ich dir leider keine Auskunft geben. Für diese Frage wende dich bitte an einen zugelassenen Finanzberater oder Steuerberater.',
      blockedOutputsMessaging:
        'Diese Antwort kann ich so leider nicht geben. Bitte wende dich an einen zugelassenen Finanzberater.',

      // Topic policies — map to constitution forbidden_categories
      topicPolicyConfig: {
        topicsConfig: [
          {
            name: 'Anlageberatung',
            definition:
              'Konkrete Kauf-, Verkauf- oder Halte-Empfehlungen für Wertpapiere, Aktien, ETFs, Kryptowährungen oder Fonds. Auch das Nennen konkreter Ticker-Symbole oder Finanzprodukte.',
            type: 'DENY',
            examples: [
              'Soll ich jetzt NVIDIA-Aktien kaufen?',
              'Welcher ETF ist der beste für mich?',
              'Ist Bitcoin gerade ein guter Kauf?',
              'Empfiehl mir einen Fonds für meine Altersvorsorge.',
            ],
          },
          {
            name: 'Steuerberatung',
            definition:
              'Konkrete Steuerberatung wie Steuererklärung ausfüllen, Absetzbarkeit prüfen, Steueroptimierung oder Steuerspar-Strategien.',
            type: 'DENY',
            examples: [
              'Kann ich mein Arbeitszimmer von der Steuer absetzen?',
              'Wie fülle ich die Anlage KAP aus?',
              'Wie kann ich Steuern sparen?',
            ],
          },
          {
            name: 'Versicherungsempfehlung',
            definition:
              'Konkrete Versicherungsprodukt-Empfehlungen, Vergleiche zwischen Anbietern oder Deckungsentscheidungen.',
            type: 'DENY',
            examples: [
              'Welche Krankenversicherung soll ich nehmen — PKV oder GKV?',
              'Brauche ich eine Berufsunfähigkeitsversicherung?',
              'Welcher Anbieter hat die beste Haftpflicht?',
            ],
          },
          {
            name: 'Altersvorsorge-konkret',
            definition:
              'Konkrete Fondsaufteilung, Entnahmestrategien oder Produktempfehlungen für Altersvorsorge wie Riester, Rürup oder betriebliche Altersvorsorge.',
            type: 'DENY',
            examples: [
              'Wie soll ich meine Riester-Rente aufteilen?',
              'Lohnt sich eine Rürup-Rente für mich?',
              'Wie viel soll ich in Anleihen vs. Aktien für die Rente stecken?',
            ],
          },
          {
            name: 'Rechtsberatung',
            definition:
              'Juristische Beratung zu Verträgen, Klagen, Insolvenzanträgen oder rechtlichen Streitigkeiten.',
            type: 'DENY',
            examples: [
              'Kann ich meinen Mietvertrag anfechten?',
              'Wie melde ich Privatinsolvenz an?',
              'Soll ich meinen Arbeitgeber verklagen?',
            ],
          },
          {
            name: 'Kreditvermittlung',
            definition:
              'Empfehlung konkreter Kreditgeber, Kreditprodukte oder Hilfe beim Kreditantrag.',
            type: 'DENY',
            examples: [
              'Welche Bank hat den besten Kredit?',
              'Soll ich bei der Sparkasse oder der ING einen Kredit nehmen?',
              'Hilf mir beim Kreditantrag.',
            ],
          },
          {
            name: 'Illegale-Finanzaktivitaeten',
            definition:
              'Geldwäsche, Steuerhinterziehung, Betrug oder andere illegale Finanzaktivitäten.',
            type: 'DENY',
            examples: [
              'Wie kann ich Geld ins Ausland schaffen ohne dass das Finanzamt davon erfährt?',
              'Wie wasche ich Geld?',
              'Kann ich Einnahmen am Finanzamt vorbeischleusen?',
            ],
          },
        ],
      },

      // Content filters — catch profanity, toxicity, prompt attacks
      contentPolicyConfig: {
        filtersConfig: [
          { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'VIOLENCE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
        ],
      },

      // Sensitive information — block PII leaks
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: [
          { type: 'EMAIL', action: 'ANONYMIZE' },
          { type: 'PHONE', action: 'ANONYMIZE' },
          { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
          { type: 'AWS_ACCESS_KEY', action: 'BLOCK' },
          { type: 'AWS_SECRET_KEY', action: 'BLOCK' },
        ],
      },

      // Word filters — explicit block list
      wordPolicyConfig: {
        wordsConfig: [
          { text: 'Kauf jetzt' },
          { text: 'garantierte Rendite' },
          { text: 'schnell reich' },
          { text: 'get rich quick' },
          { text: 'to the moon' },
        ],
      },
    });

    const guardrailsLogGroup = new logs.LogGroup(this, 'GuardrailsLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const guardrailsFn = new nodejs.NodejsFunction(this, 'GuardrailsFn', {
      entry: path.join(__dirname, '../../../services/bedrock-guardrails-poc/src/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      logGroup: guardrailsLogGroup,
      environment: {
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
        COACH_MODEL_ID: props.coachModelId,
        GUARDRAIL_ID: guardrail.attrGuardrailId,
        GUARDRAIL_VERSION: guardrail.attrVersion,
        LOG_LEVEL: 'INFO',
      },
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: 'node24',
        externalModules: ['@aws-sdk/*'],
        banner:
          "import { createRequire as topLevelCreateRequire } from 'node:module'; const require = topLevelCreateRequire(import.meta.url);",
      },
    });

    // Converse API + Guardrail permissions
    guardrailsFn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'InvokeBedrockConverse',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:*::foundation-model/${coachModelBase}`,
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${props.coachModelId}`,
        ],
      })
    );
    guardrailsFn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'ApplyBedrockGuardrail',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:ApplyGuardrail'],
        resources: [guardrail.attrGuardrailArn],
      })
    );

    this.api.addRoutes({
      path: '/turn-bedrock-guardrails',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2int.HttpLambdaIntegration('GuardrailsInt', guardrailsFn),
      authorizer: jwtAuthorizer,
    });

    new cdk.CfnOutput(this, 'GuardrailId', {
      value: guardrail.attrGuardrailId,
      description: 'Bedrock Guardrail ID for the comparison endpoint',
    });
    new cdk.CfnOutput(this, 'GuardrailsFunctionName', {
      value: guardrailsFn.functionName,
    });

    new cdk.CfnOutput(this, 'ConstitutionBucketName', {
      value: constitutionBucket.bucketName,
    });
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.apiEndpoint,
      description: 'Private API endpoint — requires Cognito JWT on Authorization header',
    });
    new cdk.CfnOutput(this, 'OrchestratorFunctionName', {
      value: this.orchestratorFn.functionName,
    });
  }
}
