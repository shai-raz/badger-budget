import { ProtectedResourceController } from "./protected-resource.controller";

describe("ProtectedResourceController", () => {
    it("returns the RFC 9728 metadata", () => {
        const controller = new ProtectedResourceController({
            mcpResourceUrl: "https://api.example.com/api/v1/mcp",
            issuer: "https://api.example.com",
        } as never);
        expect(controller.getMetadata()).toEqual({
            resource: "https://api.example.com/api/v1/mcp",
            authorization_servers: ["https://api.example.com"],
            scopes_supported: ["read"],
            bearer_methods_supported: ["header"],
            resource_name: "Badger Budget",
        });
    });

    it("sets the Cache-Control header on both routes", () => {
        const handler = ProtectedResourceController.prototype.getMetadata;
        expect(Reflect.getMetadata("__headers__", handler)).toEqual([
            { name: "Cache-Control", value: "public, max-age=300" },
        ]);
        expect(Reflect.getMetadata("path", handler)).toEqual([
            "oauth-protected-resource",
            "oauth-protected-resource/api/v1/mcp",
        ]);
    });
});
