interface EmailHeaders {
  subject?: string | null;
  from?: string | null;
  to: string[];
  cc: string[];
  date?: string | null;
  message_id?: string | null;
}

interface EmailBody {
  text?: string | null;
  html?: string | null;
}

interface AttachmentInfo {
  filename: string;
  content_type: string;
  size: number;
}

export interface EmailMessage {
  uid: number;
  user_id: string;
  account: string;
  ingested_at: Date | string;
  headers: EmailHeaders;
  body: EmailBody;
  has_attachments: boolean;
  attachments: AttachmentInfo[];
}
