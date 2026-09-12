export class NotFoundInTenantError extends Error {
  constructor(id: string) {
    super(`No workflow ${id} in this tenant`);
    this.name = 'NotFoundInTenantError';
  }
}

export class NameTakenError extends Error {
  constructor(workflowName: string) {
    super(`A workflow named "${workflowName}" already exists in this tenant`);
    this.name = 'NameTakenError';
  }
}

export class UnknownTenantError extends Error {
  constructor() {
    super('The tenant does not exist');
    this.name = 'UnknownTenantError';
  }
}

export class RunNotFoundError extends Error {
  constructor(id: string) {
    super(`No run ${id} in this tenant`);
    this.name = 'RunNotFoundError';
  }
}

export class RunStateError extends Error {
  constructor(id: string, status: string) {
    super(`Run ${id} is not ${status}`);
    this.name = 'RunStateError';
  }
}

export class SchemaNotCurrentError extends Error {
  constructor() {
    super('The database schema is behind this build; migrations are pending');
    this.name = 'SchemaNotCurrentError';
  }
}
