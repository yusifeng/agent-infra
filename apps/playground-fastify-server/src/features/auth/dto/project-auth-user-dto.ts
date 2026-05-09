export type AuthUserDto = {
  id: string;
  email: string;
};

export function projectAuthUserDto(user: { id: string }, identity: { identityValueNormalized: string }): AuthUserDto {
  return {
    id: user.id,
    email: identity.identityValueNormalized
  };
}
