# Service Layer Architecture

Service classes should now follow a single pattern.

## Base Pattern

- Extend `BaseService` from `src/common/services/base.service.ts`.
- Validate inbound payloads with `BoundaryValidationService`.
- Transform outbound objects into DTOs at the service boundary when the response shape is public.
- Keep controllers thin and move normalization into the service layer.

## Dependency Injection Rules

- Import provider modules such as `PrismaModule`, `CacheModule`, and `BoundaryValidationModule` instead of manually re-providing shared services.
- Prefer constructor order: persistence, domain collaborators, config, validation.
- Use `private readonly` injections consistently.

## Validation Rules

- Treat controller validation as a first pass only.
- Re-validate data at service entry points when the method can be called internally or across modules.
- Use DTO transformation to normalize query strings, numeric inputs, and optional payloads before business logic runs.

## Error Handling

- Throw typed exceptions with structured `details`.
- Let the global exception filter preserve explicit `errorCode` values.
- Log failures once at the service boundary or exception filter, not in every nested helper.
