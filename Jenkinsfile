ci 'aura-automation-jenkins-slave', {

    env.group = "aura"
    env.team = "blue"
    env.subteam = "shared-modules"
    env.language = "javascript"
    env.service_name = "aura-node-db-migrate"
    env.service_git_project = "ironsource-aura"
    env.service_git_repo = "${env.service_name}"
    env.service_git_repo_url = "https://stash.ironsrc.com/scm/${env.service_git_project}/${env.service_git_repo}.git"

    String version_type_minor = "minor", version_type_major = "major", version_type_patch = "patch"
    String develop_branch = "develop"

    checkout scm


    // This section will run on push/merge to release/hotfix/master branch
    production {
        auraNpm.install()

        auraNpm.publishNpmModuleToArtifactory()
    }

    def service_version = auraNpm.retrieve_node_module_version()
    manager.addShortText("v$service_version", "black", "lightblue", "1px", "black")
}
