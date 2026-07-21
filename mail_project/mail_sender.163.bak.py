import os
import smtplib
from email.mime.text import MIMEText
from email.header import Header


class MailSender:
    def __init__(self, sender_email=None, auth_code=None):
        self.smtp_server = "smtp.163.com"
        self.smtp_port = 465
        self.sender_email = sender_email or os.getenv("MAIL_SENDER_EMAIL")
        self.auth_code = auth_code or os.getenv("MAIL_SMTP_AUTH_CODE")

    def send_mail(self, to_email, subject, content):
        if not self.sender_email or not self.auth_code:
            return False, "mail credentials not configured; set MAIL_SENDER_EMAIL and MAIL_SMTP_AUTH_CODE"
        try:
            message = MIMEText(content, 'plain', 'utf-8')
            message['From'] = self.sender_email
            message['To'] = to_email
            message['Subject'] = Header(subject, 'utf-8')

            server = smtplib.SMTP_SSL(self.smtp_server, self.smtp_port)
            server.login(self.sender_email, self.auth_code)
            server.sendmail(self.sender_email, [to_email], message.as_string())
            server.quit()
            return True, "Success"
        except Exception as e:
            return False, str(e)


if __name__ == "__main__":
    sender = MailSender()
    print("MailSender 库已就绪。")
