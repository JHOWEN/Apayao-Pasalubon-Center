declare module "nodemailer" {
  export interface SendMailOptions {
    from?: string;
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
  }

  export interface TransportOptions {
    host?: string;
    port?: number;
    secure?: boolean;
    service?: string;
    auth?: {
      user?: string;
      pass?: string;
    };
  }

  export interface Transporter {
    sendMail(options: SendMailOptions): Promise<unknown>;
  }

  export function createTransport(options: TransportOptions | string): Transporter;
}
