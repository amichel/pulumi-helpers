import { Output } from "@pulumi/pulumi";

export interface IStackConfig {
    accountId: Output<string>,
    org: string,
    costCenter: string,
    accessLogsRetentionDays: number
}