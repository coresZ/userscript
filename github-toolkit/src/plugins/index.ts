import { UpstreamBindPlugin } from './upstream-bind';
import { AccelPlugin } from './github-accel';
import type { Plugin } from '../types';

/** 所有内置插件（新增插件在此注册） */
export const builtinPlugins: Plugin[] = [UpstreamBindPlugin, AccelPlugin];

export const DEFAULT_ENABLED = ['upstream-bind', 'github-accel'];
