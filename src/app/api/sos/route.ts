import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { getAuthenticatedUser } from '@/lib/auth';
import { createRateLimiter, getClientIP } from '@/lib/rateLimit';

const sosLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 5 });

const accountSid = process.env.TWILIO_ACCOUNT_SID_SOS;
const authToken = process.env.TWILIO_AUTH_TOKEN_SOS;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE;

type EmergencyContact = {
  phone: string | number;
  name: string;
};

type SendSmsSuccess = {
  success: true;
  contactName: string;
  phoneNumber: string;
  messageSid: string;
};

type SendSmsFailure = {
  success: false;
  contactName: string;
  phoneNumber: string;
  error: string;
};

type SendSmsResult = SendSmsSuccess | SendSmsFailure;

const getFailedResultDetail = (result: PromiseSettledResult<SendSmsResult>) => {
  if (result.status === 'fulfilled') {
    return result.value;
  }
  return {
    success: false,
    error: 'Failed to send SMS',
    reason: String(result.reason ?? 'Unknown error'),
  };
};

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const block = sosLimiter.check(ip);
    if (block) return block;

    if (!(await getAuthenticatedUser(request))) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const rawUserName = typeof body.userName === 'string' ? body.userName.trim().slice(0, 100) : '';
    const { emergencyContacts } = body;
    const userName = rawUserName;

    if (!emergencyContacts || !Array.isArray(emergencyContacts) || emergencyContacts.length === 0) {
      return NextResponse.json(
        { error: 'No emergency contacts found' },
        { status: 400 }
      );
    }

    if (emergencyContacts.length > 10) {
      return NextResponse.json(
        { error: 'Too many emergency contacts.' },
        { status: 400 }
      );
    }

    // Validate Twilio credentials
    if (!accountSid || !authToken || !twilioPhoneNumber) {
      const missing = [];
      if (!accountSid) missing.push('TWILIO_ACCOUNT_SID_SOS');
      if (!authToken) missing.push('TWILIO_AUTH_TOKEN_SOS');
      if (!twilioPhoneNumber) missing.push('TWILIO_PHONE_NUMBER or TWILIO_PHONE');
      
      console.error('Twilio credentials not configured. Missing:', missing.join(', '));
      return NextResponse.json(
        { 
          error: 'SMS service not configured',
          details: `Missing environment variables: ${missing.join(', ')}. Please check your .env.local file and restart the dev server.`
        },
        { status: 500 }
      );
    }

    const client = twilio(accountSid, authToken);

    // Predefined SOS message
    const sosMessage = `🚨 EMERGENCY ALERT 🚨

${userName || 'A user'} has triggered an SOS emergency`;

    // Send SMS to all emergency contacts
    const results = await Promise.allSettled(
      emergencyContacts.map(async (contact: EmergencyContact): Promise<SendSmsResult> => {
        // Convert phone number to string
        const originalPhone = String(contact.phone).trim();
        
        // If already has + prefix, use as-is, otherwise add +91
        let phoneNumber: string;
        if (originalPhone.startsWith('+')) {
          phoneNumber = originalPhone;
        } else {
          // Remove all non-digits and leading 0
          let digits = originalPhone.replace(/\D/g, '');
          if (digits.startsWith('0')) {
            digits = digits.substring(1);
          }
          // Add +91 prefix
          phoneNumber = '+91' + digits;
        }

        try {
          const message = await client.messages.create({
            body: sosMessage,
            from: twilioPhoneNumber,
            to: phoneNumber,
          });

          return {
            success: true,
            contactName: contact.name,
            phoneNumber: phoneNumber,
            messageSid: message.sid,
          };
        } catch (error: unknown) {
          console.error(`Failed to send SMS to ${contact.name} (${phoneNumber}):`, error);
          return {
            success: false,
            contactName: contact.name,
            phoneNumber: phoneNumber,
            error: 'Please enter a valid number',
          };
        }
      })
    );

    const successful = results
      .filter(
        (r): r is PromiseFulfilledResult<SendSmsSuccess> =>
          r.status === 'fulfilled' && r.value.success
      )
      .map((r) => r.value);
    const failed = results.filter(
      (r): r is PromiseRejectedResult | PromiseFulfilledResult<SendSmsFailure> =>
        r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
    );

    if (successful.length === 0) {
      return NextResponse.json(
        { 
          error: 'Please enter a valid number',
          details: failed.map((f) => getFailedResultDetail(f)),
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `SOS alert sent successfully to ${successful.length} emergency contact(s)`,
      successful,
      failed: failed.length > 0 ? failed.map((f) => getFailedResultDetail(f)) : undefined,
    });
  } catch (error: unknown) {
    console.error('SOS API error:', error);
    const details = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', details },
      { status: 500 }
    );
  }
}
