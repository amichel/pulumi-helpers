import { ComponentResourceOptions, Output, Input } from "@pulumi/pulumi";
import { CustomDeploymentComponent } from "../pulumi/CustomDeployment";
import * as pulumi from "@pulumi/pulumi";
import { PolicyDocument, Policy } from "@pulumi/aws/iam";
import { secretsmanager } from "@pulumi/aws";


export class SecretString extends CustomDeploymentComponent {
    private secretArn: Output<string>;
    private name: string;
    constructor(name: string, value: Input<string>, description?: string, opts?: ComponentResourceOptions) {
        super("SecretString", `SecretString-${name}`, opts);

        const secret = new secretsmanager.Secret(name, { name: name, recoveryWindowInDays: 0, description: description ?? name });
        const secretVersion = new secretsmanager.SecretVersion(`${name}-version`, {
            secretId: secret.id,
            secretString: value
        });
        this.name = `SecretString-${name}`;
        this.secretArn = secret.arn;
    }

    public createGetSecretPolicy(): pulumi.Output<string> {
        return this.secretArn.apply(secretArn => {

            let policy: PolicyDocument = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": "secretsmanager:GetSecretValue",
                        "Resource": secretArn
                    }
                ]
            };
            return new Policy(`${this.name}-policy`, { policy: policy }).arn;
        });
    }
}