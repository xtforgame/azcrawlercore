/* eslint-disable max-len, no-useless-escape */
import moment from 'moment';

export declare function asTwTime(inp?: moment.MomentInput, format?: moment.MomentFormatSpecification, strict?: boolean): moment.Moment;
export declare function asTwTime(inp?: moment.MomentInput, format?: moment.MomentFormatSpecification, language?: string, strict?: boolean): moment.Moment;

export declare function toTwTime(inp?: moment.MomentInput, format?: moment.MomentFormatSpecification, strict?: boolean): moment.Moment;
export declare function toTwTime(inp?: moment.MomentInput, format?: moment.MomentFormatSpecification, language?: string, strict?: boolean): moment.Moment;

export declare function twStartOf(unitOfTime: moment.unitOfTime.StartOf, inp?: moment.MomentInput, format?: moment.MomentFormatSpecification, strict?: boolean): moment.Moment;
export declare function twStartOf(unitOfTime: moment.unitOfTime.StartOf, inp?: moment.MomentInput, format?: moment.MomentFormatSpecification, language?: string, strict?: boolean): moment.Moment;

export declare function twEndOf(unitOfTime: moment.unitOfTime.StartOf, inp?: moment.MomentInput, format?: moment.MomentFormatSpecification, strict?: boolean): moment.Moment;
export declare function twEndOf(unitOfTime: moment.unitOfTime.StartOf, inp?: moment.MomentInput, format?: moment.MomentFormatSpecification, language?: string, strict?: boolean): moment.Moment;
