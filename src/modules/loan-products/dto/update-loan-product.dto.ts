import { PartialType } from '@nestjs/swagger';
import { CreateLoanProductDto } from './create-loan-product.dto';

export class UpdateLoanProductDto extends PartialType(CreateLoanProductDto) {}
