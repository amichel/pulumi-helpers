import { Config } from "@pulumi/pulumi";
import { ISnsPipelineConfig } from "../aws/SnsPipeline";

export class SnsPipelineConfig implements ISnsPipelineConfig {
    config = new Config();
    public successFeedbackSampleRate: number = this.config.getNumber("sns.successFeedbackSampleRate") ?? 100;
    public visibilityTimeoutSeconds: number = this.config.getNumber("sqs.visibilityTimeoutSeconds") ?? 30;
    public maxMessageSize: number = this.config.getNumber("sqs.maxMessageSize") ?? 10240;
    public messageRetentionSeconds: number = this.config.getNumber("sqs.messageRetentionSeconds") ?? 7 * 24 * 3600;
}