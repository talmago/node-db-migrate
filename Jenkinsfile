ci 'ecs-global-slave', {

    env.group = "aura"
    env.team = "blue"
    env.subteam = "shared-modules"
    env.language = "javascript"
    env.service_name = "aura-node-db-migrate"
    env.service_git_project = "ironsource-aura"
    env.service_git_repo = "${env.service_name}"

    String version_type_minor = "minor", version_type_major = "major", version_type_patch = "patch"
    String develop_branch = "develop"

    checkout scm


    // This section will run on push/merge to release/hotfix/master branch
    production {
            sh '''
                npm install --verbose;
                npm publish --verbose;
           '''
    }

    def service_version = auraNpm.retrieve_node_module_version("")
    manager.addShortText("v$service_version", "black", "lightblue", "1px", "black")
}
