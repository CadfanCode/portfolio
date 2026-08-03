import { about } from './about'
import { dummy } from './dummy'
import { resume } from './resume'
import type { Exhibit } from './types'

/**
 * Every exhibit in the world.
 *
 * Adding one is an import and a line here, plus the exhibit's own module. If a
 * change ever needs to reach further than that, the plugin boundary has leaked.
 */
export const EXHIBITS: readonly Exhibit[] = [dummy, resume, about]
