import { Module, Global } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';

@Global()
@Module({
    imports: [PrismaModule],
    exports: [PrismaModule],
})
export class DatabaseModule { }
