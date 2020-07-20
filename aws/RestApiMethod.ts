import { ComponentResourceOptions, OutputInstance, Input } from "@pulumi/pulumi";
import { Resource, Method, Integration, IntegrationResponse, RequestValidatorArgs, RequestValidator, MethodResponse, Model } from "@pulumi/aws/apigateway";
import { CustomDeploymentComponent } from "../pulumi/CustomDeployment";
import { readFileSync } from "fs";
import { DynamoDbActions } from "./dynamodb";
import { HttpMethod, AuthorizationMethod, IntegrationType, PassThroughBehavior, RequestParamType } from "./apigw";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import SHA1 = require("crypto-js/sha1");
import { IRestApiGateway } from "./RestApiGateway";

export class RestApiMethod extends CustomDeploymentComponent {
    private restApi: IRestApiGateway;
    private resourceId: Input<string>;
    private methodName: string;
    private httpMethod: HttpMethod;

    private method?: Method;
    private requestParameters?: { [key: string]: boolean };
    private requestModels?: { [key: string]: Input<string> };
    private validator?: RequestValidator;
    private resource: Resource;

    constructor(methodName: string, restApiId: IRestApiGateway, resource: Resource, httpMethod: HttpMethod,
        opts?: ComponentResourceOptions) {

        methodName = `${methodName}-${httpMethod}`;
        super("RestApiMethod", `RestApiMethod-${methodName}`, opts);

        this.resource = resource;
        this.resourceId = pulumi.interpolate`${resource.id}`;
        this.httpMethod = httpMethod;
        this.restApi = restApiId;
        this.methodName = methodName;
    }

    public withMethod(authorization: AuthorizationMethod, apiKeyRequired: boolean = false): RestApiMethod {
        this.method = new Method(this.methodName, {
            restApi: this.restApi.id,
            resourceId: this.resourceId,
            authorization: authorization,
            apiKeyRequired: apiKeyRequired,
            httpMethod: this.httpMethod,
            requestParameters: this.requestParameters,
            requestValidatorId: this.validator?.id,
            requestModels: this.requestModels
        }, { dependsOn: this.resource });

        this.restApi.registerDeploymentDependencies([this.method]);
        this.addDependencies(this.method);
        return this;
    }

    public withValidator(args: RequestValidatorArgs): RestApiMethod {
        if (this.method) throw new Error("Request validator must be defined before method due to api gateway dependencies");

        this.validator = new RequestValidator(`${this.methodName}-validator`, args, { dependsOn: this.resource });
        return this;
    }

    public withRequestParam(name: string, type: RequestParamType, required: boolean = true): RestApiMethod {
        if (this.method) throw new Error("Request params must be defined before method due to api gateway dependencies");

        if (!this.requestParameters) this.requestParameters = {};
        this.requestParameters[`method.request.${type}.${name}`] = required;
        return this;
    }

    public withRequestModel(modelSchemaPath?: string, transform?: (template: string) => string, contentType: string = "application/json", modelName?: "Error" | "Empty"): RestApiMethod {
        if (this.method) throw new Error("Request model must be defined before method due to api gateway dependencies");

        if (!this.requestModels) this.requestModels = {};
        if (this.requestModels[contentType]) throw new Error(`Request model already defined for content type ${contentType}`);

        if (modelName)
            this.requestModels[contentType] = modelName;
        else {
            if (!modelSchemaPath)
                throw new Error("Either predefined model name or schema path must be defined!");

            let modelSchema = readFileSync(modelSchemaPath).toString();
            modelSchema = transform ? transform(modelSchema) : modelSchema;

            const name = `${this.methodName}-${contentType.replace("/", "-")}-model`;
            const model = new Model(name, {
                contentType: contentType,
                restApi: this.restApi.id,
                schema: modelSchema,
                name: name.replace(/-/g, "0")
            });

            this.requestModels[contentType] = model.name;
            const modelSchemaHash = SHA1(modelSchema).toString();
            this.restApi.registerDeploymentVariable(modelSchemaHash);
            this.restApi.registerDeploymentDependencies([model]);
        }

        return this;
    }

    public withMockIntegrationRequestAndResponse(statusCode: number = 200): RestApiMethod {
        if (!this.method) throw new Error("Method must be defined before its integrations");

        const integrationRequest = new Integration(`${this.methodName}-integration-request`, {
            restApi: this.restApi.id,
            resourceId: this.resourceId,
            type: IntegrationType.MOCK,
            httpMethod: this.method.httpMethod,
            passthroughBehavior: PassThroughBehavior.WHEN_NO_TEMPLATES,
            requestTemplates: {
                "application/json": `{"statusCode": ${statusCode}}`
            }
        }, { dependsOn: this.method });

        const integrationResponse = new IntegrationResponse(`${this.methodName}-integration-response`, {
            restApi: this.restApi.id,
            resourceId: this.resourceId,
            httpMethod: this.method.httpMethod,
            statusCode: `${statusCode}`
        }, { dependsOn: integrationRequest });

        const methodResponse = new MethodResponse(`${this.methodName}-method-response`, {
            restApi: this.restApi.id,
            resourceId: this.resourceId,
            httpMethod: this.method.httpMethod,
            statusCode: `${statusCode}`
        }, { dependsOn: integrationResponse })

        this.restApi.registerDeploymentDependencies([integrationRequest, integrationResponse, methodResponse]);
        this.addDependencies(integrationRequest, integrationResponse, methodResponse);
        return this;
    }

    public withDynamoDbIntegrationRequestAndResponse(tableName: string, action: DynamoDbActions, requestTemplatePath: string,
        responseTemplatePath: string, timeout: number = 10000,
        credentials?: string | Promise<string> | OutputInstance<string> | undefined): RestApiMethod {
        if (!this.method) throw new Error("Method must be defined before its integrations");

        const requestTemplate = readFileSync(requestTemplatePath).toString().replace("@@TABLENAME@@", tableName);
        const integrationRequest = new Integration(`${this.methodName}-integration-request`, {
            restApi: this.restApi.id,
            resourceId: this.resourceId,
            type: IntegrationType.AWS,
            httpMethod: this.method.httpMethod,
            integrationHttpMethod: HttpMethod.POST,
            passthroughBehavior: PassThroughBehavior.NEVER,
            timeoutMilliseconds: timeout,
            uri: `arn:aws:apigateway:${aws.config.region}:dynamodb:action/${action}`,
            credentials: credentials,
            requestTemplates: {
                "application/json": requestTemplate
            }
        }, { dependsOn: this.method! });

        const responseTemplate = readFileSync(responseTemplatePath).toString().replace("@@TABLENAME@@", tableName);
        const integrationResponse = new IntegrationResponse(`${this.methodName}-integration-response`, {
            restApi: this.restApi.id,
            resourceId: this.resourceId,
            statusCode: "200",
            httpMethod: this.method.httpMethod,
            responseTemplates: {
                "application/json": responseTemplate
            }
        }, { dependsOn: integrationRequest });

        const methodResponse200 = new MethodResponse(`${this.methodName}-method-response-200`, {
            restApi: this.restApi.id,
            resourceId: this.resourceId,
            httpMethod: this.method.httpMethod,
            statusCode: "200",
            responseModels: { "application/json": "Empty" }
        }, { dependsOn: integrationResponse })

        const methodResponse500 = new MethodResponse(`${this.methodName}-method-response-500`, {
            restApi: this.restApi.id,
            resourceId: this.resourceId,
            httpMethod: this.method.httpMethod,
            statusCode: "500",
            responseModels: { "application/json": "Error" }
        }, { dependsOn: integrationResponse })

        const templatesHash = SHA1(`${requestTemplate}#${responseTemplate}`).toString();
        this.restApi.registerDeploymentVariable(templatesHash);
        this.restApi.registerDeploymentDependencies([integrationRequest, integrationResponse, methodResponse200, methodResponse500]);
        return this;
    }

    public withSNSIntegrationRequestAndResponse(topicArn: Input<string>,
        credentials?: string | Promise<string> | OutputInstance<string> | undefined, timeout: number = 10000,
        requestTemplatePath?: string, responseTemplatePath?: string): RestApiMethod {
        if (!this.method) throw new Error("Method must be defined before its integrations");

        const requestTemplate = pulumi.interpolate`${topicArn}`.apply(topic => {
            requestTemplatePath = requestTemplatePath ?? `${__dirname}/templates/apigw.sns.publish.default.request.vtl`;
            return readFileSync(requestTemplatePath).toString().replace("@@TOPIC@@", topic);
        })

        const integrationRequest = new Integration(`${this.methodName}-integration-request`, {
            restApi: this.restApi.id,
            resourceId: this.resourceId,
            type: IntegrationType.AWS,
            httpMethod: this.httpMethod,
            integrationHttpMethod: HttpMethod.POST,
            passthroughBehavior: PassThroughBehavior.NEVER,
            timeoutMilliseconds: timeout,
            uri: `arn:aws:apigateway:${aws.config.region}:sns:action/Publish`,
            credentials: credentials,
            requestTemplates: {
                "application/json": requestTemplate
            }
        }, { dependsOn: [this.method!, this.resource] });


        responseTemplatePath = responseTemplatePath ?? `${__dirname}/templates/apigw.sns.publish.default.response.vtl`;
        const responseTemplate = readFileSync(responseTemplatePath).toString();
        const integrationResponse = new IntegrationResponse(`${this.methodName}-integration-response`, {
            restApi: this.restApi.id,
            resourceId: this.resourceId,
            statusCode: "200",
            httpMethod: this.method.httpMethod,
            responseTemplates: {
                "application/json": responseTemplate
            }
        }, { dependsOn: integrationRequest });

        const methodResponse200 = new MethodResponse(`${this.methodName}-method-response-200`, {
            restApi: this.restApi.id,
            resourceId: this.resourceId,
            httpMethod: this.method.httpMethod,
            statusCode: "200",
            responseModels: { "application/json": "Empty" }
        }, { dependsOn: integrationResponse })

        const methodResponse500 = new MethodResponse(`${this.methodName}-method-response-500`, {
            restApi: this.restApi.id,
            resourceId: this.resourceId,
            httpMethod: this.method.httpMethod,
            statusCode: "500",
            responseModels: { "application/json": "Error" }
        }, { dependsOn: integrationResponse })

        const templatesHash = SHA1(`${requestTemplate}#${responseTemplate}`).toString();
        this.restApi.registerDeploymentVariable(templatesHash);
        this.restApi.registerDeploymentDependencies([integrationRequest, integrationResponse, methodResponse200, methodResponse500]);
        return this;
    }

    public withLambdaIntegrationRequestAndResponse(tableName: string, lambdaArn: Input<string>, requestTemplatePath: string,
        responseTemplatePath: string, timeout: number = 10000,
        credentials?: string | Promise<string> | OutputInstance<string> | undefined): RestApiMethod {
        if (!this.method) throw new Error("Method must be defined before its integrations");

        const requestTemplate = readFileSync(requestTemplatePath).toString().replace("@@TABLENAME@@", tableName);;
        const integrationRequest = new Integration(`${this.methodName}-integration-request`, {
            restApi: this.restApi.id,
            resourceId: this.resourceId,
            type: IntegrationType.AWS,
            httpMethod: this.method.httpMethod,
            integrationHttpMethod: HttpMethod.POST,
            passthroughBehavior: PassThroughBehavior.NEVER,
            timeoutMilliseconds: timeout,
            uri: pulumi.interpolate`arn:aws:apigateway:${aws.config.region}:lambda:path/2015-03-31/functions/${lambdaArn}/invocations`,
            credentials: credentials,
            requestTemplates: {
                "application/json": requestTemplate
            }
        }, { dependsOn: this.method! });

        const responseTemplate = readFileSync(responseTemplatePath).toString().replace("@@TABLENAME@@", tableName);;
        const integrationResponse = new IntegrationResponse(`${this.methodName}-integration-response`, {
            restApi: this.restApi.id,
            resourceId: this.resourceId,
            statusCode: "200",
            httpMethod: this.method.httpMethod,
            responseTemplates: {
                "application/json": responseTemplate
            }
        }, { dependsOn: integrationRequest });

        const methodResponse200 = new MethodResponse(`${this.methodName}-method-response-200`, {
            restApi: this.restApi.id,
            resourceId: this.resourceId,
            httpMethod: this.method.httpMethod,
            statusCode: "200",
            responseModels: { "application/json": "Empty" }
        }, { dependsOn: integrationResponse })

        const methodResponse500 = new MethodResponse(`${this.methodName}-method-response-500`, {
            restApi: this.restApi.id,
            resourceId: this.resourceId,
            httpMethod: this.method.httpMethod,
            statusCode: "500",
            responseModels: { "application/json": "Error" }
        }, { dependsOn: integrationResponse })

        const templatesHash = SHA1(`${requestTemplate}#${responseTemplate}`).toString();
        this.restApi.registerDeploymentVariable(templatesHash);
        this.restApi.registerDeploymentDependencies([integrationRequest, integrationResponse, methodResponse200, methodResponse500]);
        return this;
    }
}
