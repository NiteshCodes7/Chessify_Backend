import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST!,
      port: Number(process.env.MAIL_PORT! ?? 587),
      secure: process.env.MAIL_SECURE! === 'true', // true for 465, false for 587
      auth: {
        user: process.env.MAIL_USER!,
        pass: process.env.MAIL_PASS!,
      },
    });
  }

  async sendOtp(to: string, code: string): Promise<void> {
    await this.transporter.sendMail({
      from: `"Chessify" <${process.env.MAIL_FROM ?? process.env.MAIL_USER}>`,
      to,
      subject: `${code} is your Chessify verification code`,
      attachments: [
        {
          filename: 'logo_chessify.png',
          path: './assets/logo_chessify.png',
          cid: 'logo_chessify_cid',
        },
      ],
      text: `Hi Grand Master,\n\nYour verification code is: ${code}\n\nIt expires in 10 minutes. If you didn't create a Chessify account, you can ignore this email.\n\n— Chessify`,
      html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

                <!-- Logo -->
                <tr>
                  <td align="center" style="padding-bottom:32px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding-bottom:32px;">
                          <img src="cid:logo_chessify_cid" alt="Chessify Logo" width="120" style="display:block;" />
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Card -->
                <tr>
                  <td style="background:#0e0e0e;border:1px solid #1e1e1e;padding:40px 36px;">

                    <!-- Eyebrow -->
                    <table cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                      <tr>
                        <td style="width:20px;height:1px;background:#c8a96e;vertical-align:middle;"></td>
                        <td style="padding-left:10px;color:#c8a96e;font-size:10px;letter-spacing:4px;text-transform:uppercase;vertical-align:middle;">
                          Verify email
                        </td>
                      </tr>
                    </table>

                    <!-- Heading -->
                    <p style="margin:0 0 8px;font-family:Georgia,serif;color:#f0ebe0;font-size:28px;font-weight:400;line-height:1.2;">
                      Hi Grand Master,
                    </p>
                    <p style="margin:0 0 28px;font-family:Georgia,serif;color:#c8a96e;font-size:28px;font-weight:400;font-style:italic;line-height:1.2;">
                      your code awaits.
                    </p>

                    <p style="margin:0 0 24px;color:#555;font-size:13px;font-weight:300;line-height:1.7;">
                      Enter this code on the verification page to complete your registration.
                      It expires in <strong style="color:#888;font-weight:400;">10 minutes</strong>.
                    </p>

                    <!-- OTP code block -->
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;border:1px solid #3a3020;">
                      <tr>
                        <td style="padding:18px 36px;background:#13100a;">
                          <span style="font-family:Georgia,serif;font-size:36px;font-weight:400;letter-spacing:12px;color:#c8a96e;">
                            ${code}
                          </span>
                        </td>
                      </tr>
                    </table>

                    <!-- Divider -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                      <tr><td style="height:1px;background:#1a1a1a;"></td></tr>
                    </table>

                    <p style="margin:0;color:#3a3a3a;font-size:11px;font-weight:300;line-height:1.6;">
                      If you didn't create a Chessify account, you can safely ignore this email.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td align="center" style="padding-top:24px;">
                    <p style="margin:0;color:#2a2a2a;font-size:11px;font-weight:300;">
                      © ${new Date().getFullYear()} Chessify. All rights reserved.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
            `,
    });
  }
}
