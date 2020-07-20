import { ComponentResourceOptions, Input, Output } from "@pulumi/pulumi";
import { CustomDeploymentComponent } from "../pulumi/CustomDeployment";
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { GetZoneResult } from "@pulumi/aws/route53";


export class AcmCertificate extends CustomDeploymentComponent {

    private zone: Input<GetZoneResult>;
    private domainName: string;
    private name: string;
    private apiDomainNameCertificate?: aws.acm.Certificate;
    public arn?: Input<string>;
    private opts: ComponentResourceOptions | undefined;
    private outputArnName: string | undefined;

    constructor(domainName: string, name: string = "", zone?: GetZoneResult, outputArnName?: string, opts?: ComponentResourceOptions) {
        super("AcmCertificate", `AcmCert-${domainName}${name}`, opts);
        this.opts = opts;
        this.name = name;
        this.domainName = domainName;
        this.outputArnName = outputArnName;
        this.zone = zone ?? aws.route53.getZone({ name: domainName });
    }

    public withCertiticate(validationMethod: "DNS" | "EMAIL" | "NONE" = "DNS", domainName: string = `*.${this.domainName}`, certificateTransparencyLoggingEnabled: boolean = false): AcmCertificate {

        this.apiDomainNameCertificate = new aws.acm.Certificate(`cert-${this.domainName}${this.name}`, {
            domainName: domainName,
            validationMethod: validationMethod,
            options: { certificateTransparencyLoggingPreference: certificateTransparencyLoggingEnabled ? "ENABLED" : "DISABLED" }
        })

        this.arn = this.apiDomainNameCertificate.arn;
        if (this.outputArnName) this.addOutput(this.outputArnName, this.arn);
        return this;
    }

    public withDnsValidation(ttl: number = 600): AcmCertificate {
        if (!this.apiDomainNameCertificate) throw new Error("Certificate must be defined before DNS validation records");

        pulumi.output(this.zone).apply(zone => {
            const validationCNAME = new aws.route53.Record(`cert-validation-cname-${zone.name}${this.name}`, {
                name: this.apiDomainNameCertificate!.domainValidationOptions[0].resourceRecordName,
                records: [this.apiDomainNameCertificate!.domainValidationOptions[0].resourceRecordValue],
                ttl: 600,
                type: this.apiDomainNameCertificate!.domainValidationOptions[0].resourceRecordType,
                zoneId: zone.zoneId,
            });

            const certValidation = new aws.acm.CertificateValidation(`cert-validation-${zone.name}${this.name}`, {
                certificateArn: this.apiDomainNameCertificate!.arn,
                validationRecordFqdns: [validationCNAME.fqdn]
            });
        });

        return this;
    }
}