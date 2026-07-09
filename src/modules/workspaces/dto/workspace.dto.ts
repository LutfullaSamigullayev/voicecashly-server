import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWorkspaceDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsIn(['personal', 'team'])
  type: 'personal' | 'team';
}

export class JoinWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  inviteCode: string;
}

export class RenameWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;
}
