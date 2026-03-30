import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: '*' });
  const port = process.env.PORT ?? 3001;
  const server = app.getHttpServer();
  server.keepAliveTimeout = 30000; // 30s — evita EOF em conexões idle (default Node.js = 5s)
  await app.listen(port);
  console.log(`API running on port ${port}`);
}
bootstrap();
