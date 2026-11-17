package dev.whereiparked.dto;

import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.ValueDeserializer;

/** Used only by provider DTOs; does not change the application's JSON mapper. */
public class StrictTextDeserializer extends ValueDeserializer<String> {
    @Override
    public String deserialize(JsonParser parser, DeserializationContext context) {
        if (!parser.hasToken(JsonToken.VALUE_STRING)) {
            return context.reportInputMismatch(String.class, "Expected a JSON string");
        }
        return parser.getString();
    }
}
