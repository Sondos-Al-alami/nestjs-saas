import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { StripeBillingService } from './stripe-billing.service';

@Controller('webhooks')
export class StripeWebhookController {
  constructor(private readonly stripeBilling: StripeBillingService) {}

  @Post('stripe')
  async stripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    const raw = req.rawBody;
    if (!raw) {
      throw new BadRequestException(
        'Missing raw body (enable Nest rawBody for Stripe webhooks)',
      );
    }
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    await this.stripeBilling.handleWebhookPayload(buf, signature);
    return { received: true };
  }
}
