import { ComponentResourceOptions, Input, Output } from "@pulumi/pulumi";
import { RestApi, Deployment, MethodSettings, Stage, DomainName, BasePathMapping, Account, Resource, ApiKey, UsagePlanKey, UsagePlan } from "@pulumi/aws/apigateway";
import { CustomDeploymentComponent } from "../pulumi/CustomDeployment";
import { readFileSync } from "fs";
import { EndpointType } from "./apigw";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import SHA1 = require("crypto-js/sha1");
import { cloudwatch, route53 } from "@pulumi/aws";
import { Policy } from "@pulumi/aws/iam";
import { IamFactory } from "./iam";
import { IStackConfig } from "../pulumi/IStackConfig";
import { StackConfig } from "../config/StackConfig";
import { ApiGatewayConfig } from "../config/ApiGatewayConfig";

export interface IApiGatewayConfig {
    loggingLevel: string;
    metricsEnabled: boolean;
    throttlingBurstLimit: number;
    throttlingRateLimit: number;
    minimumCompressionSize: number;
}

export interface IRestApiGateway {
    id: Input<string>;
    registerDeploymentVariable(dependencyVar: any): void;
    registerDeploymentDependencies(dependencies: pulumi.Resource[]): void;
    createRootApiResource(name: string): Resource;
}

export class RestApiGateway extends CustomDeploymentComponent implements IRestApiGateway {
    private restApi: RestApi;
    private apiName: string;
    public id: Input<string>;
    public arn: Input<string>;
    private deploymentVariables: any[];
    private deploymentDependencies: pulumi.Resource[];
    private stage?: Stage;
    private config: IApiGatewayConfig;
    private stackConfig: IStackConfig;

    constructor(apiName: string, stackConfig: IStackConfig = new StackConfig(),
        config: IApiGatewayConfig = new ApiGatewayConfig(),
        endpointType = EndpointType.REGIONAL,
        opts?: ComponentResourceOptions) {
        super("RestApiGateway", `RestApiGateway-${apiName}`, opts);
        this.config = config;
        this.stackConfig = stackConfig;
        this.apiName = apiName;
        this.restApi = new RestApi(apiName, {
            name: apiName,
            endpointConfiguration: { types: endpointType },
            minimumCompressionSize: config.minimumCompressionSize
        });
        this.id = this.restApi.id;
        this.arn = this.restApi.arn;
        this.deploymentVariables = [];
        this.deploymentDependencies = [this.restApi];
        this.addOutput("api", { name: this.restApi.name, id: this.restApi.id, rootResourceId: this.restApi.rootResourceId, arn: this.restApi.arn });
    }

    registerDeploymentVariable(dependencyVar: any): void {
        this.deploymentVariables.push(dependencyVar);
    }

    registerDeploymentDependencies(dependencies: Resource[]): void {
        this.deploymentDependencies.push(...dependencies);
    }

    public withPublicApiAccessGroup(publicApiAccessGroup: Input<string>): RestApiGateway {
        const apiPolicy = this.createInvokePolicy(["GET", "POST"]);
        IamFactory.createGroupPolicyAttachements(publicApiAccessGroup, [apiPolicy.arn]);
        return this;
    }

    public withCloudwatchRole(cloudwatchRoleArn: Input<string>): RestApiGateway {
        const accountSettings = new Account(`${this.apiName}-accountSettings`, {
            cloudwatchRoleArn: cloudwatchRoleArn
        });
        return this;
    }

    public withDeployment(stageName: string, deploymentVariables: Record<string, any> = {}): RestApiGateway {
        stageName = stageName ?? pulumi.getStack();

        const templatesHash = SHA1(this.deploymentVariables.join("#")).toString();
        
        const deployment = new Deployment(`${this.apiName}-deployment-${stageName}`, {
            restApi: this.restApi.id,
            variables: { templatesHash: templatesHash }
        }, { dependsOn: this.deploymentDependencies, customTimeouts: { create: "10m", delete: "10m", update: "10m" } });

        const cloudWatchAccessLogs = new cloudwatch.LogGroup(`${this.apiName}-${pulumi.getStack()}-access-logs`,
            { retentionInDays: this.stackConfig.accessLogsRetentionDays });

        const accessLogFormat = readFileSync(`${__dirname}/templates/apiGwAccessLog.txt`).toString();

        const stage = new Stage(stageName, {
            restApi: this.restApi.id,
            deployment: deployment.id,
            stageName: stageName,
            accessLogSettings: { destinationArn: cloudWatchAccessLogs.arn, format: accessLogFormat }
        }, { dependsOn: deployment, customTimeouts: { create: "10m", delete: "10m", update: "10m" } });

        const methodSettings = new MethodSettings("method-settings", {
            restApi: this.restApi.id, stageName: stageName, methodPath: "*/*",
            settings: {
                metricsEnabled: this.config.metricsEnabled,
                throttlingRateLimit: this.config.throttlingRateLimit,
                throttlingBurstLimit: this.config.throttlingBurstLimit,
                loggingLevel: this.config.loggingLevel
            }
        }, { dependsOn: [deployment, stage] });

        this.stage = stage;
        this.addDependencies(stage, deployment);
        return this;
    }

    public withCustomDomain(stageName: string,
        domainName: Input<string>, zoneId: Input<string>, certificateArn: Input<string>): RestApiGateway {
        stageName = stageName ?? pulumi.getStack();

        let customDomainName = pulumi.interpolate`api-${pulumi.getStack()}.${domainName}`;
        customDomainName.apply(name => {
            name = name.slice(undefined, name.length - 1);

            const webDomain = new DomainName(`domain-${name}`, {
                regionalCertificateArn: certificateArn,
                domainName: name,
                endpointConfiguration: { types: EndpointType.REGIONAL }
            });

            const webDomainMapping = new BasePathMapping(`domain-mapping-${name}`, {
                restApi: this.restApi.id,
                stageName: stageName,
                domainName: webDomain.id
            }, { dependsOn: this.restApi });

            const restApiCNAME = new route53.Record(`alias-${name}`, {
                name: webDomain.domainName,
                type: "A",
                zoneId: zoneId,
                aliases: [{
                    evaluateTargetHealth: false,
                    name: webDomain.regionalDomainName,
                    zoneId: webDomain.regionalZoneId,
                }]
            });
        });

        return this;
    }

    public withApiKey(keyName: string, keyValue: Output<string>): RestApiGateway {
        if (!this.stage) throw new Error("Stage must be defined before api keys!")

        keyValue.apply(keyValue => {
            const key = new ApiKey(`${keyName}-${pulumi.getStack()}`, { value: keyValue })
            const plan = new UsagePlan(`${keyName}-${pulumi.getStack()}-up`, {
                apiStages: [{
                    apiId: this.id,
                    stage: this.stage!.stageName
                }]
            }, { dependsOn: this.stage })
            const attachKeyToPlan = new UsagePlanKey(`${keyName}-${pulumi.getStack()}-upk`, { keyId: key.id, keyType: "API_KEY", usagePlanId: plan.id })
        });

        return this;
    }

    public createInvokePolicy(methods: string[] = ["GET"], apistage: string = "*"): Output<Policy> {
        return this.restApi.id.apply(apiId => {
            const resources = methods.map(v => `arn:aws:execute-api:${aws.config.region}:*:${apiId}/${apistage}/${v}/*`);
            return new aws.iam.Policy("InvokePolicyForPublicApi", {
                policy: JSON.stringify({
                    "Version": "2012-10-17",
                    "Statement": [
                        {
                            "Effect": "Allow",
                            "Action": [
                                "execute-api:Invoke"
                            ],
                            "Resource": resources
                        }
                    ]
                })
            })
        });
    };

    public createRootApiResource(name: string): Resource {
        return new Resource(name, { restApi: this.restApi.id, parentId: this.restApi.rootResourceId, pathPart: name });
    }
}