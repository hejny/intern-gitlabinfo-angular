// app-routing.module.ts
import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {ProjectDetailsComponent} from "../components/project-details/project-details.component";

export const routes: Routes = [
  {path: '', redirectTo: 'gitlab-projects', pathMatch: 'full'},
  {
    path: "gitlab-projects",
    loadComponent: () => import("../view/projects/projects.component")
      .then((m) => m.ProjectsComponent),
  },
  { path: 'gitlab-projects/:id', component: ProjectDetailsComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {
}
