import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET') || 'CHANGE_ME',
    });
  }

  async validate(payload: any) {
    // payload contains sub, email, role, branch
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }
    const user = { id: payload.sub, email: payload.email, role: payload.role, branch: payload.branch };
    console.log('JWT validated user:', user);
    return user;
  }
}
