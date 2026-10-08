import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { AppException } from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-code.js';
import type { Env } from '../config/env.validation.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ME_SELECT } from '../users/me.select.js';
import type { AuthResponseDto, MeDto } from './dto/auth-response.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

const BCRYPT_ROUNDS = 10;
// A real hash to compare against when the email is unknown, so both login
// failures cost the same.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const emailTaken = () =>
      new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.EMAIL_TAKEN,
        'This email is already registered.',
      );

    if (await this.prisma.user.findUnique({ where: { email: dto.email } })) {
      throw emailTaken();
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
          fullName: dto.fullName,
          phoneE164: dto.phoneE164,
          city: dto.city,
        },
        select: ME_SELECT,
      });
      return this.session(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw emailTaken();
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const found = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { ...ME_SELECT, passwordHash: true },
    });
    const matches = await bcrypt.compare(
      dto.password,
      found?.passwordHash ?? DUMMY_HASH,
    );
    if (!found || !matches) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.INVALID_CREDENTIALS,
        'Incorrect email or password',
      );
    }

    const { passwordHash: _passwordHash, ...user } = found;
    return this.session(user);
  }

  private async session(user: MeDto): Promise<AuthResponseDto> {
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      tokenType: 'Bearer',
      expiresIn: this.config.get('JWT_EXPIRES_IN', { infer: true }),
      user,
    };
  }
}
