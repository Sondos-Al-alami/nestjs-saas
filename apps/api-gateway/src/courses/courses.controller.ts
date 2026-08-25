import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { GetTenant, Role, SubscriptionTier } from '@saas/common';
import type { Request } from 'express';
import { AuthenticatedUser, Roles } from '../auth';
import { CourseGatewayService } from './course-gateway.service';
import {
  CreateCourseDto,
  CreateEnrollmentDto,
  CreateLessonDto,
  UpdateCourseDto,
  UpdateEnrollmentDto,
  UpdateLessonDto,
} from './dto';

@ApiTags('courses')
@ApiBearerAuth('access-token')
@ApiSecurity('tenant-id')
@Controller()
export class CoursesGatewayController {
  constructor(private readonly courseGateway: CourseGatewayService) {}

  private userFrom(req: Request): AuthenticatedUser | undefined {
    return req.user as AuthenticatedUser | undefined;
  }

  @Get('courses')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  listCourses(@GetTenant() tenantId: string) {
    return this.courseGateway.listCourses({ tenantId });
  }

  @Post('courses')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  createCourse(
    @GetTenant() tenantId: string,
    @Req() req: Request,
    @Body() body: CreateCourseDto,
  ) {
    const user = this.userFrom(req);
    return this.courseGateway.createCourse({
      tenantId,
      title: body.title,
      subscriptionTier: user?.subscriptionTier ?? SubscriptionTier.FREE,
    });
  }

  @Get('courses/:courseId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  getCourse(
    @GetTenant() tenantId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
  ) {
    return this.courseGateway.getCourse({ tenantId, courseId });
  }

  @Patch('courses/:courseId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  updateCourse(
    @GetTenant() tenantId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() body: UpdateCourseDto,
  ) {
    return this.courseGateway.updateCourse({
      tenantId,
      courseId,
      title: body.title,
    });
  }

  @Delete('courses/:courseId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  deleteCourse(
    @GetTenant() tenantId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
  ) {
    return this.courseGateway.deleteCourse({ tenantId, courseId });
  }

  @Get('courses/:courseId/lessons')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  listLessons(
    @GetTenant() tenantId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
  ) {
    return this.courseGateway.listLessons({ tenantId, courseId });
  }

  @Post('courses/:courseId/lessons')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  createLesson(
    @GetTenant() tenantId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() body: CreateLessonDto,
  ) {
    return this.courseGateway.createLesson({
      tenantId,
      courseId,
      title: body.title,
      body: body.body,
      sortOrder: body.sortOrder,
    });
  }

  @Get('courses/:courseId/lessons/:lessonId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  getLesson(
    @GetTenant() tenantId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
  ) {
    return this.courseGateway.getLesson({ tenantId, courseId, lessonId });
  }

  @Patch('courses/:courseId/lessons/:lessonId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  updateLesson(
    @GetTenant() tenantId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
    @Body() body: UpdateLessonDto,
  ) {
    return this.courseGateway.updateLesson({
      tenantId,
      courseId,
      lessonId,
      title: body.title,
      body: body.body,
      sortOrder: body.sortOrder,
    });
  }

  @Delete('courses/:courseId/lessons/:lessonId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  deleteLesson(
    @GetTenant() tenantId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
  ) {
    return this.courseGateway.deleteLesson({
      tenantId,
      courseId,
      lessonId,
    });
  }

  @Post('courses/:courseId/enrollments')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  enrollUserInCourse(
    @GetTenant() tenantId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() body: CreateEnrollmentDto,
  ) {
    return this.courseGateway.createEnrollment({
      tenantId,
      courseId,
      userId: body.userId,
    });
  }

  @Get('courses/:courseId/enrollments')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  listCourseEnrollments(
    @GetTenant() tenantId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
  ) {
    return this.courseGateway.listEnrollmentsByCourse({
      tenantId,
      courseId,
    });
  }

  @Get('me/enrollments')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR, Role.LEARNER)
  listMyEnrollments(@GetTenant() tenantId: string, @Req() req: Request) {
    const user = this.userFrom(req);
    return this.courseGateway.listEnrollmentsByUser({
      tenantId,
      userId: user?.userId ?? '',
    });
  }

  @Get('enrollments/:enrollmentId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR, Role.LEARNER)
  getEnrollment(
    @GetTenant() tenantId: string,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Req() req: Request,
  ) {
    const user = this.userFrom(req);
    return this.courseGateway.getEnrollment({
      tenantId,
      enrollmentId,
      actingUserId: user?.userId ?? '',
      actingRole: user?.role ?? Role.LEARNER,
    });
  }

  @Patch('enrollments/:enrollmentId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR, Role.LEARNER)
  patchEnrollment(
    @GetTenant() tenantId: string,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Req() req: Request,
    @Body() body: UpdateEnrollmentDto,
  ) {
    const user = this.userFrom(req);
    return this.courseGateway.updateEnrollment({
      tenantId,
      enrollmentId,
      actingUserId: user?.userId ?? '',
      actingRole: user?.role ?? Role.LEARNER,
      progressPercent: body.progressPercent,
      lessonsCompleted: body.lessonsCompleted,
      completed: body.completed,
      touchAccess: body.touchAccess,
    });
  }

  @Delete('enrollments/:enrollmentId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  unenrollUser(
    @GetTenant() tenantId: string,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ) {
    return this.courseGateway.deleteEnrollment({ tenantId, enrollmentId });
  }
}
