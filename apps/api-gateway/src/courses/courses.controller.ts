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
import { GetTenant, Role, SubscriptionTier } from '@saas/common';
import type { Request } from 'express';
import { ApiGatewayService } from '../api-gateway.service';
import { Roles } from '../auth';
import {
  CreateCourseDto,
  CreateEnrollmentDto,
  CreateLessonDto,
  UpdateCourseDto,
  UpdateEnrollmentDto,
  UpdateLessonDto,
} from './dto';

@Controller()
export class CoursesGatewayController {
  constructor(private readonly apiGatewayService: ApiGatewayService) {}

  @Get('courses')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  listCourses(@GetTenant() tenantId: string) {
    return this.apiGatewayService.listCourses({ tenantId });
  }

  @Post('courses')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  createCourse(
    @GetTenant() tenantId: string,
    @Req() req: Request,
    @Body() body: CreateCourseDto,
  ) {
    return this.apiGatewayService.createCourse({
      tenantId,
      title: body.title,
      subscriptionTier: req.user?.subscriptionTier ?? SubscriptionTier.FREE,
    });
  }

  @Get('courses/:courseId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  getCourse(
    @GetTenant() tenantId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
  ) {
    return this.apiGatewayService.getCourse({ tenantId, courseId });
  }

  @Patch('courses/:courseId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  updateCourse(
    @GetTenant() tenantId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() body: UpdateCourseDto,
  ) {
    return this.apiGatewayService.updateCourse({
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
    return this.apiGatewayService.deleteCourse({ tenantId, courseId });
  }

  @Get('courses/:courseId/lessons')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  listLessons(
    @GetTenant() tenantId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
  ) {
    return this.apiGatewayService.listLessons({ tenantId, courseId });
  }

  @Post('courses/:courseId/lessons')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  createLesson(
    @GetTenant() tenantId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() body: CreateLessonDto,
  ) {
    return this.apiGatewayService.createLesson({
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
    return this.apiGatewayService.getLesson({ tenantId, courseId, lessonId });
  }

  @Patch('courses/:courseId/lessons/:lessonId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR)
  updateLesson(
    @GetTenant() tenantId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
    @Body() body: UpdateLessonDto,
  ) {
    return this.apiGatewayService.updateLesson({
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
    return this.apiGatewayService.deleteLesson({
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
    return this.apiGatewayService.createEnrollment({
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
    return this.apiGatewayService.listEnrollmentsByCourse({
      tenantId,
      courseId,
    });
  }

  @Get('me/enrollments')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR, Role.LEARNER)
  listMyEnrollments(@GetTenant() tenantId: string, @Req() req: Request) {
    return this.apiGatewayService.listEnrollmentsByUser({
      tenantId,
      userId: req.user?.userId ?? '',
    });
  }

  @Get('enrollments/:enrollmentId')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.INSTRUCTOR, Role.LEARNER)
  getEnrollment(
    @GetTenant() tenantId: string,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Req() req: Request,
  ) {
    return this.apiGatewayService.getEnrollment({
      tenantId,
      enrollmentId,
      actingUserId: req.user?.userId ?? '',
      actingRole: req.user?.role ?? Role.LEARNER,
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
    return this.apiGatewayService.updateEnrollment({
      tenantId,
      enrollmentId,
      actingUserId: req.user?.userId ?? '',
      actingRole: req.user?.role ?? Role.LEARNER,
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
    return this.apiGatewayService.deleteEnrollment({ tenantId, enrollmentId });
  }
}
