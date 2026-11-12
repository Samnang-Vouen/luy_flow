import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { hashPassword } from '../auth/utils/hash.util';

async function seedAdmin() {
    const dataSource = new DataSource({
        type: 'postgres',
        host: process.env.DATABASE_HOST,
        port: parseInt(process.env.DATABASE_PORT ?? '5433', 10),
        username: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        entities: [User],
    });

    await dataSource.initialize();

    const userRepository = dataSource.getRepository(User);

    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@luyflow.com';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
    const adminName = process.env.SEED_ADMIN_NAME ?? 'LuyFlow Admin';

    const existing = await userRepository.findOne({
        where: { email: adminEmail },
    });
    if (existing) {
        console.log(`Admin already exists: ${adminEmail}`);
        await dataSource.destroy();
        return;
    }

    const passwordHash = await hashPassword(adminPassword);

    const admin = userRepository.create({
        name: adminName,
        email: adminEmail,
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
    });

    await userRepository.save(admin);

    console.log('Admin account created:');
    console.log(`  Email: ${adminEmail}`);
    console.log(`  Password: ${adminPassword}`);
    console.log(
        'Share these with your team, then change the password after first login.',
    );

    await dataSource.destroy();
    }

    seedAdmin().catch((err) => {
        console.error('Seed failed:', err);
        process.exit(1);
});
