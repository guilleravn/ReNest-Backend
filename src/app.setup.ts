import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { validateEnv } from './config/env.validation.js';
import { HttpExceptionFilter } from './common/errors/http-exception.filter.js';
import { createValidationPipe } from './common/errors/validation.js';

// Shared by main.ts and the e2e tests so both run the exact same app.
export function setupApp(app: INestApplication): INestApplication {
  // ConfigService returns the raw env string when the variable is set, so the
  // origins are parsed again here to get the normalized list.
  const { CORS_ORIGIN: origins } = validateEnv(process.env);
  if (origins?.length) {
    app.enableCors({ origin: origins });
  }

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
