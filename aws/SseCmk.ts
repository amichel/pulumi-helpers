import { ComponentResourceOptions, Input, Output } from "@pulumi/pulumi";
import { CustomDeploymentComponent } from "../pulumi/CustomDeployment";
import * as pulumi from "@pulumi/pulumi";
import { Key } from "@pulumi/aws/kms";
import { PolicyDocument } from "@pulumi/aws/iam";
import { IStackConfig } from "../pulumi/IStackConfig";
import { StackConfig } from "../config/StackConfig";


export class SseCmk extends CustomDeploymentComponent {
    public keyId: Output<string>;
    private stackConfig: IStackConfig;

    constructor(name: string, services: string[], roleArns: Input<string>[],
        stackConfig: IStackConfig = new StackConfig(), opts?: ComponentResourceOptions) {
        super("SseCmk", `SseCmk-${name}`, opts);
        this.stackConfig = stackConfig;
        const cmk = new Key(`${name}-sse-cmk`, {
            enableKeyRotation: true, policy: this.createPolicy(services, roleArns)
        });

        this.keyId = cmk.id;
    }

    private createPolicy(services: string[], roleArns: Input<string>[]): string | Promise<string> | pulumi.OutputInstance<string> {
        return pulumi.all([this.stackConfig.accountId, ...roleArns]).apply(([accountId, ...roleArns]) => {
            services.forEach((s, i) => services[i] = `${s}.amazonaws.com`);
            let policy: PolicyDocument = {
                "Version": "2012-10-17",
                "Statement": [{
                    "Sid": "Enable IAM User Permissions",
                    "Effect": "Allow",
                    "Principal": { "AWS": `arn:aws:iam::${accountId}:root` },
                    "Action": "kms:*",
                    "Resource": "*"
                }, {
                    "Effect": "Allow",
                    "Principal": {
                        "Service": services
                    },
                    "Action": ["kms:GenerateDataKey*", "kms:Decrypt", "kms:Encrypt"],
                    "Resource": "*"
                }, {
                    "Sid": "Allow access to service roles",
                    "Effect": "Allow",
                    "Principal": { "AWS": roleArns },
                    "Action": ["kms:GenerateDataKey*", "kms:Decrypt", "kms:Encrypt"],
                    "Resource": "*"
                }]
            };
            return JSON.stringify(policy);
        });
    }
}