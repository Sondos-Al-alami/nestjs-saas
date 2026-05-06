import { Role } from './role.enum';

/** Whether `actor` may assign `targetRole` when inviting or provisioning users. */
export function canAssignRole(actor: Role, targetRole: Role): boolean {
  if (actor === Role.SUPER_ADMIN) {
    return true;
  }
  if (actor === Role.ORG_ADMIN) {
    return targetRole !== Role.SUPER_ADMIN;
  }
  return false;
}
