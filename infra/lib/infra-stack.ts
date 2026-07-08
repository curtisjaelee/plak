import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---------- VPC ----------
    const vpc = new ec2.Vpc(this, 'PlakVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { cidrMask: 24, name: 'public', subnetType: ec2.SubnetType.PUBLIC },
        { cidrMask: 24, name: 'private', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });

    vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // ---------- RDS Postgres ----------
    const dbCredentials = rds.Credentials.fromGeneratedSecret('plak_admin');

    const database = new rds.DatabaseInstance(this, 'PlakDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      credentials: dbCredentials,
      databaseName: 'plak',
      allocatedStorage: 20,
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const dbEnv = {
      DB_HOST: database.dbInstanceEndpointAddress,
      DB_NAME: 'plak',
      DB_USER: 'plak_admin',
      DB_PASSWORD: database.secret!.secretValueFromJson('password').unsafeUnwrap(),
    };

    // ---------- S3: Photos bucket ----------
    const photosBucket = new s3.Bucket(this, 'PlakPhotosBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ---------- Lambda: Post Confirmation (Cognito trigger) ----------
    const postConfirmationFn = new lambda.Function(this, 'PostConfirmationFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../backend/post-confirmation'),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: dbEnv,
      timeout: cdk.Duration.seconds(10),
    });
    database.connections.allowFrom(postConfirmationFn, ec2.Port.tcp(5432));

    // ---------- Cognito ----------
    const userPool = new cognito.UserPool(this, 'PlakUserPool', {
      userPoolName: 'plak-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: false,
        requireDigits: true,
        requireSymbols: false,
      },
      customAttributes: {
        invite_code: new cognito.StringAttribute({ mutable: true }),
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lambdaTriggers: {
        postConfirmation: postConfirmationFn,
      },
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'PlakUserPoolClient', {
      userPool,
      authFlows: { userPassword: true, userSrp: true },
      generateSecret: false,
    });

    // ---------- Lambda: GET /activities ----------
    const getActivitiesFn = new lambda.Function(this, 'GetActivitiesFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../backend/get-activities'),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: {
        ...dbEnv,
        PHOTOS_BUCKET: photosBucket.bucketName,
      },
      timeout: cdk.Duration.seconds(10),
    });
    database.connections.allowFrom(getActivitiesFn, ec2.Port.tcp(5432));
    photosBucket.grantRead(getActivitiesFn);

    // ---------- Lambda: POST /activities ----------
    const postActivityFn = new lambda.Function(this, 'PostActivityFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../backend/post-activity'),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: dbEnv,
      timeout: cdk.Duration.seconds(10),
    });
    database.connections.allowFrom(postActivityFn, ec2.Port.tcp(5432));

    // ---------- Lambda: PUT /activities/{id} ----------
    const putActivityFn = new lambda.Function(this, 'PutActivityFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../backend/put-activity'),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: dbEnv,
      timeout: cdk.Duration.seconds(10),
    });
    database.connections.allowFrom(putActivityFn, ec2.Port.tcp(5432));

    // ---------- Lambda: GET /couple ----------
    const getCoupleFn = new lambda.Function(this, 'GetCoupleFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../backend/get-couple'),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: dbEnv,
      timeout: cdk.Duration.seconds(10),
    });
    database.connections.allowFrom(getCoupleFn, ec2.Port.tcp(5432));

    // ---------- Lambda: DELETE /activities/{id} ----------
    const deleteActivityFn = new lambda.Function(this, 'DeleteActivityFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../backend/delete-activity'),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: {
        ...dbEnv,
        PHOTOS_BUCKET: photosBucket.bucketName,
      },
      timeout: cdk.Duration.seconds(10),
    });
    database.connections.allowFrom(deleteActivityFn, ec2.Port.tcp(5432));
    photosBucket.grantDelete(deleteActivityFn);

    // ---------- Lambda: GET /activities/{id}/photo ----------
    const getUploadUrlFn = new lambda.Function(this, 'GetUploadUrlFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../backend/get-upload-url'),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: {
        ...dbEnv,
        PHOTOS_BUCKET: photosBucket.bucketName,
      },
      timeout: cdk.Duration.seconds(10),
    });
    database.connections.allowFrom(getUploadUrlFn, ec2.Port.tcp(5432));
    photosBucket.grantPut(getUploadUrlFn);

    // ---------- Lambda: PUT /activities/reorder ----------
    const putReorderFn = new lambda.Function(this, 'PutReorderFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../backend/put-reorder'),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: dbEnv,
      timeout: cdk.Duration.seconds(10),
    });
    database.connections.allowFrom(putReorderFn, ec2.Port.tcp(5432));

    // ---------- Lambda: GET /activities/bucket/{bucket} ----------
    const getActivitiesByBucketFn = new lambda.Function(this, 'GetActivitiesByBucketFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../backend/get-activities-by-bucket'),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: dbEnv,
      timeout: cdk.Duration.seconds(10),
    });
    database.connections.allowFrom(getActivitiesByBucketFn, ec2.Port.tcp(5432));

    // ---------- Lambda: PUT /activities/bucket-rank ----------
    const putBucketRankFn = new lambda.Function(this, 'PutBucketRankFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../backend/put-bucket-rank'),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: dbEnv,
      timeout: cdk.Duration.seconds(10),
    });
    database.connections.allowFrom(putBucketRankFn, ec2.Port.tcp(5432));

    // ---------- Bastion ----------
    const bastion = new ec2.Instance(this, 'PlakBastion', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
    });
    bastion.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    );
    database.connections.allowFrom(bastion, ec2.Port.tcp(5432));
    new cdk.CfnOutput(this, 'BastionInstanceId', { value: bastion.instanceId });

    // ---------- API Gateway ----------
    const api = new apigateway.RestApi(this, 'PlakApi', {
      restApiName: 'plak-api',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
    });

    new apigateway.CfnAccount(this, 'ApiGatewayAccount', {
      cloudWatchRoleArn: new iam.Role(this, 'ApiGatewayCloudWatchRole', {
        assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonAPIGatewayPushToCloudWatchLogs'),
        ],
      }).roleArn,
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'PlakAuthorizer', {
      cognitoUserPools: [userPool],
    });

    const activitiesResource = api.root.addResource('activities');

    activitiesResource.addMethod('GET', new apigateway.LambdaIntegration(getActivitiesFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    activitiesResource.addMethod('POST', new apigateway.LambdaIntegration(postActivityFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const reorderResource = activitiesResource.addResource('reorder');
    reorderResource.addMethod('PUT', new apigateway.LambdaIntegration(putReorderFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const bucketResource = activitiesResource.addResource('bucket').addResource('{bucket}');
    bucketResource.addMethod('GET', new apigateway.LambdaIntegration(getActivitiesByBucketFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const bucketRankResource = activitiesResource.addResource('bucket-rank');
    bucketRankResource.addMethod('PUT', new apigateway.LambdaIntegration(putBucketRankFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const activityByIdResource = activitiesResource.addResource('{id}');

    activityByIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(deleteActivityFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    activityByIdResource.addMethod('PUT', new apigateway.LambdaIntegration(putActivityFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const uploadUrlResource = activityByIdResource.addResource('photo');
    uploadUrlResource.addMethod('GET', new apigateway.LambdaIntegration(getUploadUrlFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const coupleResource = api.root.addResource('couple');
    coupleResource.addMethod('GET', new apigateway.LambdaIntegration(getCoupleFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ---------- Frontend hosting (S3 + CloudFront) ----------
    const frontendBucket = new s3.Bucket(this, 'PlakFrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'PlakDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [s3deploy.Source.asset('../frontend/dist')],
      destinationBucket: frontendBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // ---------- Outputs ----------
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'FrontendUrl', { value: `https://${distribution.distributionDomainName}` });
  }
}