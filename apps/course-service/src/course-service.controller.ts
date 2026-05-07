import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  MSG_COURSE_CREATE,
  MSG_COURSE_DELETE,
  MSG_COURSE_ENROLLMENT_CREATE,
  MSG_COURSE_ENROLLMENT_DELETE,
  MSG_COURSE_ENROLLMENT_GET,
  MSG_COURSE_ENROLLMENT_LIST_BY_COURSE,
  MSG_COURSE_ENROLLMENT_LIST_BY_USER,
  MSG_COURSE_ENROLLMENT_UPDATE,
  MSG_COURSE_GET,
  MSG_COURSE_HEALTH,
  MSG_COURSE_LESSON_CREATE,
  MSG_COURSE_LESSON_DELETE,
  MSG_COURSE_LESSON_GET,
  MSG_COURSE_LESSON_UPDATE,
  MSG_COURSE_LESSONS_LIST,
  MSG_COURSE_LIST,
  MSG_COURSE_UPDATE,
} from '@saas/common';
import { CourseServiceService } from './course-service.service';
import {
  CreateCoursePayloadDto,
  CreateEnrollmentPayloadDto,
  CreateLessonPayloadDto,
  DeleteCoursePayloadDto,
  DeleteEnrollmentPayloadDto,
  DeleteLessonPayloadDto,
  GetCoursePayloadDto,
  GetEnrollmentPayloadDto,
  GetLessonPayloadDto,
  ListCoursesPayloadDto,
  ListEnrollmentsByCoursePayloadDto,
  ListEnrollmentsByUserPayloadDto,
  ListLessonsPayloadDto,
  UpdateCoursePayloadDto,
  UpdateEnrollmentPayloadDto,
  UpdateLessonPayloadDto,
} from './dto/tcp-payloads.dto';

@Controller()
export class CourseServiceController {
  constructor(private readonly courseServiceService: CourseServiceService) {}

  @MessagePattern(MSG_COURSE_HEALTH)
  health() {
    return this.courseServiceService.health();
  }

  @MessagePattern(MSG_COURSE_LIST)
  listCourses(@Payload() payload: ListCoursesPayloadDto) {
    return this.courseServiceService.listCourses(payload);
  }

  @MessagePattern(MSG_COURSE_GET)
  getCourse(@Payload() payload: GetCoursePayloadDto) {
    return this.courseServiceService.getCourse(payload);
  }

  @MessagePattern(MSG_COURSE_CREATE)
  createCourse(@Payload() payload: CreateCoursePayloadDto) {
    return this.courseServiceService.createCourse(payload);
  }

  @MessagePattern(MSG_COURSE_UPDATE)
  updateCourse(@Payload() payload: UpdateCoursePayloadDto) {
    return this.courseServiceService.updateCourse(payload);
  }

  @MessagePattern(MSG_COURSE_DELETE)
  deleteCourse(@Payload() payload: DeleteCoursePayloadDto) {
    return this.courseServiceService.deleteCourse(payload);
  }

  @MessagePattern(MSG_COURSE_LESSONS_LIST)
  listLessons(@Payload() payload: ListLessonsPayloadDto) {
    return this.courseServiceService.listLessons(payload);
  }

  @MessagePattern(MSG_COURSE_LESSON_GET)
  getLesson(@Payload() payload: GetLessonPayloadDto) {
    return this.courseServiceService.getLesson(payload);
  }

  @MessagePattern(MSG_COURSE_LESSON_CREATE)
  createLesson(@Payload() payload: CreateLessonPayloadDto) {
    return this.courseServiceService.createLesson(payload);
  }

  @MessagePattern(MSG_COURSE_LESSON_UPDATE)
  updateLesson(@Payload() payload: UpdateLessonPayloadDto) {
    return this.courseServiceService.updateLesson(payload);
  }

  @MessagePattern(MSG_COURSE_LESSON_DELETE)
  deleteLesson(@Payload() payload: DeleteLessonPayloadDto) {
    return this.courseServiceService.deleteLesson(payload);
  }

  @MessagePattern(MSG_COURSE_ENROLLMENT_CREATE)
  createEnrollment(@Payload() payload: CreateEnrollmentPayloadDto) {
    return this.courseServiceService.createEnrollment(payload);
  }

  @MessagePattern(MSG_COURSE_ENROLLMENT_LIST_BY_COURSE)
  listEnrollmentsByCourse(
    @Payload() payload: ListEnrollmentsByCoursePayloadDto,
  ) {
    return this.courseServiceService.listEnrollmentsByCourse(payload);
  }

  @MessagePattern(MSG_COURSE_ENROLLMENT_LIST_BY_USER)
  listEnrollmentsByUser(@Payload() payload: ListEnrollmentsByUserPayloadDto) {
    return this.courseServiceService.listEnrollmentsByUser(payload);
  }

  @MessagePattern(MSG_COURSE_ENROLLMENT_GET)
  getEnrollment(@Payload() payload: GetEnrollmentPayloadDto) {
    return this.courseServiceService.getEnrollment(payload);
  }

  @MessagePattern(MSG_COURSE_ENROLLMENT_UPDATE)
  updateEnrollment(@Payload() payload: UpdateEnrollmentPayloadDto) {
    return this.courseServiceService.updateEnrollment(payload);
  }

  @MessagePattern(MSG_COURSE_ENROLLMENT_DELETE)
  deleteEnrollment(@Payload() payload: DeleteEnrollmentPayloadDto) {
    return this.courseServiceService.deleteEnrollment(payload);
  }
}
