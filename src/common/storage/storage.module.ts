import { Global, Module } from '@nestjs/common';
import { LocalFsStorageProvider } from './local-fs.storage';
import { STORAGE_PROVIDER } from './storage.types';

@Global()
@Module({
  providers: [
    LocalFsStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      useExisting: LocalFsStorageProvider,
    },
  ],
  exports: [STORAGE_PROVIDER, LocalFsStorageProvider],
})
export class StorageModule {}
