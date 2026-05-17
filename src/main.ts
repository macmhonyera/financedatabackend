import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { validateEnv } from './common/env-validation';
import { buildCorsOptions } from './common/cors';

async function bootstrap() {
  validateEnv();
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors(buildCorsOptions());
  // request logging
  // morgan is used for simple HTTP request logging in dev
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const morgan = require('morgan');
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  } catch (err) {
    // morgan not installed in some environments - skip
  }

  const config = new DocumentBuilder()
    .setTitle('Finance API')
    .setDescription('API for finance frontend')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3031;
  await app.listen(port);
  logger.log(`Backend listening on http://localhost:${port}`);
  logger.log(`Swagger docs available at http://localhost:${port}/api/docs`);
}

bootstrap();
