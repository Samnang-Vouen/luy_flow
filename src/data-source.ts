import 'dotenv/config';
import { DataSource } from 'typeorm';

// Loaded as .ts from src/ (`npm run typeorm`, via ts-node) or as .js from dist/
// (`npm run migration:run:prod`, in the Docker image where ts-node isn't installed).
// One extension only, so the .d.ts files next to the .js in dist/ never match.
const root = __dirname.replace(/\\/g, '/');
const ext = __filename.endsWith('.ts') ? 'ts' : 'js';

export default new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT ?? '5433', 10),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    entities: [`${root}/**/*.entity.${ext}`],
    migrations: [`${root}/migrations/*.${ext}`],
});