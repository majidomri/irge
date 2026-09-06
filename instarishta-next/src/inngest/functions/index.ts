/**
 * The function registry the route handler serves.
 *
 * Every function has to be listed here or Inngest never learns it exists —
 * it will not appear in the dashboard and its cron will never fire. This is
 * the one file to touch when adding a job.
 */
import { ordersSweep } from './orders-sweep';

export const functions = [
  ordersSweep,
];
