import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { PersistenceModule } from './persistence.module';

@Module({})
class TestApp {}

describe('PersistenceModule shutdown', () => {
  afterEach(() => vi.restoreAllMocks());

  it('closes the initialized pool after consumers drain their work', async () => {
    let drained = false;
    const initialize = vi.spyOn(DataSource.prototype, 'initialize');
    initialize.mockImplementation(async function (this: DataSource) {
      Object.defineProperty(this, 'isInitialized', { value: true });
      return this;
    });
    const destroy = vi.spyOn(DataSource.prototype, 'destroy');
    destroy.mockImplementation(async () => { expect(drained).toBe(true); });
    const consumer = { onModuleDestroy: async () => {
      await Promise.resolve();
      drained = true;
    } };
    const persistence = PersistenceModule.forRootAsync({
      useFactory: () => ({ url: 'postgresql://unused:unused@localhost/unused' }),
    });
    const p1 = { module: TestApp, imports: [persistence] };
    const module = { ...p1, providers: [{ provide: 'consumer', useValue: consumer }] };
    const app = await NestFactory.createApplicationContext(module, { logger: false });
    await app.close();
    expect(initialize).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
