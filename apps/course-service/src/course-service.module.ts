import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { CourseServiceController } from './course-service.controller';
import { CourseServiceService } from './course-service.service';

@Module({
  imports: [PrismaModule],
  controllers: [CourseServiceController],
  providers: [CourseServiceService],
})
export class CourseServiceModule {}
