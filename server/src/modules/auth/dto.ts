import { IsString, Matches, Length, IsPhoneNumber } from 'class-validator';

export class SendCodeDto {
  @IsPhoneNumber('CN', { message: '手机号格式不正确' })
  phone: string;
}

export class LoginDto {
  @IsPhoneNumber('CN', { message: '手机号格式不正确' })
  phone: string;

  @IsString()
  @Length(6, 6, { message: '验证码必须是6位数字' })
  @Matches(/^\d+$/, { message: '验证码必须是数字' })
  code: string;
}
