import { IApiGatewayConfig } from "../aws/RestApiGateway";
import { Config } from "@pulumi/pulumi";

export class ApiGatewayConfig implements IApiGatewayConfig {
    config = new Config();
    loggingLevel: string = this.config.get("apiGateway.loggingLevel") ?? "ERROR";
    metricsEnabled: boolean = this.config.getBoolean("apiGateway.metricsEnabled") ?? true;
    throttlingBurstLimit: number = this.config.getNumber("apiGateway.throttlingBurstLimit") ?? 1000;
    throttlingRateLimit: number = this.config.getNumber("apiGateway.throttlingRateLimit") ?? 500;
    minimumCompressionSize: number = this.config.getNumber("apiGateway.minimumCompressionSize") ?? 20000;
}