import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';

const express = require('express');
const server = express();

let bootstrapPromise: Promise<void> | null = null;

async function bootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
      );

      const corsOrigins = (process.env.CORS_ORIGINS || '')
        .split(',')
        .map((value: string) => value.trim())
        .filter((value: string) => value.length > 0);
      app.enableCors({
        origin: corsOrigins.length > 0 ? corsOrigins : true,
        credentials: true,
      });

      try {
        const morgan = require('morgan');
        app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
      } catch (err) {
        // Morgan is optional in serverless contexts.
      }

      const config = new DocumentBuilder()
        .setTitle('Finance API')
        .setDescription('API for finance frontend')
        .setVersion('1.0')
        .addBearerAuth()
        .build();

      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api/docs', app, document);

      await app.init();
    })();
  }

  await bootstrapPromise;
}

export default async function handler(req: any, res: any) {
  await bootstrap();
  return server(req, res);
}
