import { HttpException, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

export type HealthResponse = { service: string; ok: boolean };

export function normalizeRpcError(error: unknown): never {
  const fallbackMessage = 'Downstream service error';
  const e = error as
    | {
        status?: number;
        statusCode?: number;
        message?: string | string[];
        error?: {
          status?: number;
          statusCode?: number;
          message?: string | string[];
        };
        response?: {
          status?: number;
          statusCode?: number;
          message?: string | string[];
        };
      }
    | undefined;

  const status =
    e?.status ??
    e?.statusCode ??
    e?.error?.status ??
    e?.error?.statusCode ??
    e?.response?.status ??
    e?.response?.statusCode;

  const messageValue =
    e?.message ?? e?.error?.message ?? e?.response?.message ?? fallbackMessage;
  const message = Array.isArray(messageValue)
    ? messageValue.join(', ')
    : String(messageValue || fallbackMessage);

  if (/already exists/i.test(message)) {
    throw new HttpException({ message }, HttpStatus.CONFLICT);
  }

  if (typeof status === 'number' && status >= 400 && status <= 599) {
    throw new HttpException({ message }, status);
  }

  throw new HttpException({ message }, HttpStatus.INTERNAL_SERVER_ERROR);
}

export async function tcpCall<T>(
  client: ClientProxy,
  pattern: string,
  payload: unknown,
): Promise<T> {
  try {
    return await firstValueFrom(client.send<T>(pattern, payload));
  } catch (error) {
    normalizeRpcError(error);
  }
}
