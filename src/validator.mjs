import Ajv from 'ajv';
import schema from './board.schema.json' with {type:'json'};
export default new Ajv({allErrors:true}).compile(schema);
