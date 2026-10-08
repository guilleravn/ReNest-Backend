import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { validateEnv } from './config/env.validation.js';
import { HttpExceptionFilter } from './common/errors/http-exception.filter.js';
import { createValidationPipe } from './common/errors/validation.js';

// Shared by main.ts and the e2e tests so both run the exact same app.
export function setupApp(app: INestApplication): INestApplication {
  // ConfigService returns the raw env string when the variable is set, so the
  // origins are parsed again here to get the normalized list.
  const env = validateEnv(process.env);
  const { CORS_ORIGIN: origins } = env;
  if (origins?.length) {
    app.enableCors({ origin: origins });
  }

  // Behind Railway's proxy every request would share the proxy's IP, and so
  // one rate-limit counter. Trust exactly the known hops so clients cannot
  // spoof X-Forwarded-For.
  (app as NestExpressApplication).set(
    'trust proxy',
    env.TRUST_PROXY_HOPS ?? (env.NODE_ENV === 'production' ? 1 : 0),
  );

  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('ReNest API')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, document);

  return app;
}
