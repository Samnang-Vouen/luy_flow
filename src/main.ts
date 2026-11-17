import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const isProduction = configService.get('NODE_ENV') === 'production';

  app.use(helmet({ contentSecurityPolicy: false }));
  app.set('trust proxy', 1);

  // Comma-separated allow-list; with nothing configured, reflect the caller's
  // origin so a local frontend can talk to the API during development.
  const corsOrigins = (configService.get<string>('CORS_ORIGIN') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // BullMQ workers must finish in-flight jobs on SIGTERM.
  app.enableShutdownHooks();

  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('LuyFlow API')
      .setDescription('API documentation for LuyFlow')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT access token',
          in: 'header',
        },
        'access-token', // this name is referenced below
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  const port = Number(configService.get('PORT') ?? 3000);
  await app.listen(port);
}
bootstrap();
