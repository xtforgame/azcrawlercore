/* eslint-disable max-len, no-useless-escape */
import moment from 'moment';

export const asTwTime = (...args) => moment.utc(...args).utcOffset('+08:00', true); // change time
export const toTwTime = (...args) => moment.utc(...args).utcOffset('+08:00', false); // change zone only
export const twStartOf = (unitOfTime, ...args) => moment.utc(...args).utcOffset('+08:00', false).startOf(unitOfTime); // change zone only
export const twEndOf = (unitOfTime, ...args) => moment.utc(...args).utcOffset('+08:00', false).endOf(unitOfTime); // change zone only
