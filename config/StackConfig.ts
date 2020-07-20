import { Output, Config } from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { IStackConfig } from "../pulumi/IStackConfig";

export class StackConfig implements IStackConfig {
    constructor() {
        const config = new Config();

        this.org = config.require("org");
        this.costCenter = config.get("costCenter") ?? "aws";

        const current = pulumi.output(aws.getCallerIdentity({ async: true }));
        this.accountId = current.accountId;
        this.accessLogsRetentionDays = config.getNumber("accessLogsRetentionDays") ?? 30;
    }


    public accountId: Output<string>;
    public org: string;
    public costCenter: string;
    public accessLogsRetentionDays: number;
}
