// Superficie pública de la capa API. Las features importan desde '@/app/api'.
export { RestClient } from './clients/rest/rest.client';
export { joinApi } from './clients/rest/rest.endpoints';
export type { QueryParams, RestOptions } from './clients/rest/rest.contracts';
export type { ApiError } from './http/http-errors';
export { DomainError, isDomainError, toDomainError } from './http/http-errors';
export { SKIP_AUTH } from './http/tokens';
